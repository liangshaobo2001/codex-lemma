//! Tool discovery wire contracts. Execution and approval remain owned by Codex.
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

pub const SEARCH_NAME: &str = "tool_search";
pub const MAX_SEARCH_RESULTS: usize = 8;
// This is the complete pass-through surface. A contract test covers every entry.
pub const PASSTHROUGH_TOOL_KINDS:&[&str]=&["custom","web_search","web_search_preview","image_generation","computer","computer_use_preview","code_interpreter","tool_search"];

fn portable_alias(namespace:Option<&str>,name:&str,key:&str)->String {
    if namespace.is_none() && name.len()<=64 && name.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'_'||c==b'-') {return name.into();}
    let mut hash=0xcbf29ce484222325u64;
    for byte in key.bytes() {hash=(hash^u64::from(byte)).wrapping_mul(0x100000001b3);}
    let prefix:String=key.chars().map(|c|if c.is_ascii_alphanumeric()||c=='_'||c=='-' {c}else{'_'}).take(47).collect();
    format!("{prefix}_{hash:016x}")
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Mode { Native, Function, Direct }

#[derive(Clone, Debug)]
pub struct Tool {
    pub namespace: Option<String>,
    pub name: String,
    pub key: String,
    pub alias: String,
    pub spec: Value,
    pub deferred: bool,
}

#[derive(Clone, Debug, Default)]
pub struct Inventory {
    pub tools: BTreeMap<String, Tool>,
    pub other: Vec<Value>,
}

fn required_string<'a>(v: &'a Value, key: &str) -> Result<&'a str, String> {
    v.get(key).and_then(Value::as_str).filter(|s| !s.trim().is_empty())
        .ok_or_else(|| format!("Tool protocol is missing {key}."))
}

impl Inventory {
    pub fn parse(specs: &[Value]) -> Result<Self, String> {
        let mut result=Self::default();
        for spec in specs {
            match required_string(spec,"type")? {
                "namespace" => {
                    let namespace=required_string(spec,"name")?;
                    let tools=spec.get("tools").and_then(Value::as_array)
                        .ok_or("Tool namespace has no tools array.")?;
                    for tool in tools { result.insert(Some(namespace),tool)?; }
                },
                "function" => result.insert(None,spec)?,
                // These tools have their own provider protocol; never reinterpret them as functions.
                kind if PASSTHROUGH_TOOL_KINDS.contains(&kind) => result.other.push(spec.clone()),
                kind => return Err(format!("Unsupported tool declaration type: {kind}")),
            }
        }
        result.assign_aliases();
        Ok(result)
    }

    fn insert(&mut self, namespace: Option<&str>, spec: &Value) -> Result<(), String> {
        let kind=required_string(spec,"type")?;
        if !matches!(kind,"function"|"custom") { return Err("Only function or custom tools may be nested in a namespace.".into()); }
        let name=required_string(spec,"name")?;
        if name==SEARCH_NAME && namespace.is_none() { return Err("A tool conflicts with Lemma's discovery function.".into()); }
        if kind=="function" && !spec.get("parameters").is_some_and(Value::is_object) { return Err("Function tool parameters must be an object.".into()); }
        if kind=="custom" && !spec.get("format").is_some_and(Value::is_object) { return Err("Custom tool format must be an object.".into()); }
        let key=namespace.map_or_else(||name.to_string(),|n|format!("{n}.{name}"));
        // A stable index in sorted canonical order is assigned below, avoiding lossy name sanitization.
        let deferred=namespace.is_some_and(|n|!matches!(n,"functions"|"multi_agent_v1")) || name.starts_with("mcp__");
        let tool=Tool{namespace:namespace.map(str::to_string),name:name.into(),key:key.clone(),alias:String::new(),spec:spec.clone(),deferred};
        if self.tools.insert(key,tool).is_some() { return Err("Duplicate tool identity.".into()); }
        Ok(())
    }

    pub fn assign_aliases(&mut self) {
        for tool in self.tools.values_mut() {
            tool.alias=portable_alias(tool.namespace.as_deref(),&tool.name,&tool.key);
        }
        // User tool names can resemble generated names. Every alias must remain unique.
        let mut used=BTreeSet::new();
        for (index,tool) in self.tools.values_mut().enumerate() {
            let mut attempt=0;
            while !used.insert(tool.alias.clone()) { attempt+=1;tool.alias=format!("lemma_tool_{index}_{attempt}"); }
        }
    }

    pub fn search(&self, query: &str, limit: usize) -> Vec<String> {
        let query=query.to_lowercase();
        let terms:Vec<_>=query.split(|c:char|!c.is_alphanumeric()&&c!='_').filter(|s|s.len()>1).collect();
        let mut ranked:Vec<_>=self.tools.values().filter(|t|t.deferred).filter_map(|tool| {
            let key=tool.key.to_lowercase();
            let description=tool.spec["description"].as_str().unwrap_or("").to_lowercase();
            let score=terms.iter().map(|term|usize::from(key.contains(term))*10+usize::from(description.contains(term))).sum::<usize>();
            (score>0).then_some((score,tool.key.clone()))
        }).collect();
        ranked.sort_by(|a,b|b.0.cmp(&a.0).then_with(||a.1.cmp(&b.1)));
        ranked.into_iter().take(limit.clamp(1,MAX_SEARCH_RESULTS)).map(|(_,key)|key).collect()
    }

    pub fn declarations(&self, _mode: Mode, selected: &BTreeSet<String>) -> Vec<Value> {
        let mut specs=self.other.clone();
        for tool in self.tools.values().filter(|t|!t.deferred||selected.contains(&t.key)) {
            let mut spec=tool.spec.clone();
            spec["name"]=json!(tool.alias);
            if tool.namespace.is_some() { spec["description"]=json!(format!("{}: {}",tool.key,spec["description"].as_str().unwrap_or(""))); }
            spec.as_object_mut().unwrap().remove("defer_loading");
            specs.push(spec);
        }
        specs
    }

    pub fn discoveries(&self, mode:Mode, selected:&BTreeSet<String>) -> Vec<Value> {
        let subset=Self{tools:self.tools.iter().filter(|(_,tool)|tool.deferred&&selected.contains(&tool.key)).map(|(key,tool)|(key.clone(),tool.clone())).collect(),other:vec![]};
        subset.declarations(mode,selected)
    }

    pub fn canonical_discoveries(&self,selected:&BTreeSet<String>) -> Vec<Value> {
        let mut namespaces:BTreeMap<&str,Vec<Value>>=BTreeMap::new();let mut result=Vec::new();
        for tool in self.tools.values().filter(|t|t.deferred&&selected.contains(&t.key)) {
            if let Some(namespace)=tool.namespace.as_deref() { namespaces.entry(namespace).or_default().push(tool.spec.clone()); }
            else { result.push(tool.spec.clone()); }
        }
        for (name,tools) in namespaces { result.push(json!({"type":"namespace","name":name,"tools":tools})); }result
    }

    pub fn search_declaration(mode: Mode) -> Value {
        let parameters=json!({"type":"object","properties":{"query":{"type":"string","description":"Names or keywords for the tool needed to complete the user's task."}},"required":["query"],"additionalProperties":false});
        if mode==Mode::Native { json!({"type":"tool_search","execution":"client","description":"Find installed tools and load their definitions before calling them.","parameters":parameters}) }
        else { json!({"type":"function","name":SEARCH_NAME,"description":"Find installed tools and load their definitions before calling them. Search by tool name or task keywords.","parameters":parameters}) }
    }

    pub fn decode_call(&self, item: &Value, _mode: Mode) -> Result<Value,String> {
        let mut result=item.clone();
        if item["type"]=="custom_tool_call" && self.tools.values().all(|tool|tool.alias!=item["name"]) {
            required_string(item,"call_id")?;
            if !item["input"].is_string() || !self.other.iter().any(|spec|spec["type"]=="custom"&&spec["name"]==item["name"]) {
                return Err("The provider called an unavailable or invalid custom tool.".into());
            }
        }
        if matches!(item["type"].as_str(),Some("function_call"|"custom_tool_call")) && item["name"]!=SEARCH_NAME {
            let alias=required_string(item,"name")?;
            let Some(tool)=self.tools.values().find(|t|t.alias==alias) else {
                if item["type"]=="custom_tool_call" {return Ok(result);}
                return Err(format!("The model called an unavailable tool: {alias}"));
            };
            required_string(item,"call_id")?;
            if item["type"]=="function_call" && (tool.spec["type"]!="function"||!item["arguments"].is_string()) {return Err("Function tool calls require JSON-string arguments.".into());}
            if item["type"]=="custom_tool_call" && (tool.spec["type"]!="custom"||!item["input"].is_string()) {return Err("Custom tool calls require text input.".into());}
            result["name"]=json!(tool.name);
            if let Some(namespace)=&tool.namespace { result["namespace"]=json!(namespace); }
            else { result.as_object_mut().unwrap().remove("namespace"); }
        }
        Ok(result)
    }

    pub fn encode_history(&self, items: &mut [Value], _mode: Mode) -> Result<(),String> {
        for item in items {
            if !matches!(item["type"].as_str(),Some("function_call"|"custom_tool_call")) { continue; }
            let name=required_string(item,"name")?;
            if name==SEARCH_NAME { continue; }
            let key=item["namespace"].as_str().map_or_else(||name.to_string(),|n|format!("{n}.{name}"));
            if let Some(tool)=self.tools.get(&key) {
                item["name"]=json!(tool.alias);item.as_object_mut().unwrap().remove("namespace");
            } else {
                // Disconnected historical tools are still valid history, but never become executable.
                item["name"]=json!(portable_alias(item["namespace"].as_str(),name,&key));item.as_object_mut().unwrap().remove("namespace");
            }
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SearchCall { pub call_id: String, pub query: String }

pub fn search_call(item: &Value, mode: Mode) -> Result<Option<SearchCall>,String> {
    let matches=if mode==Mode::Native { item["type"]=="tool_search_call" }
        else { item["type"]=="function_call" && item["name"]==SEARCH_NAME };
    if !matches { return Ok(None); }
    if mode==Mode::Native && item["execution"]!="client" {return Err("Native discovery must use client execution.".into());}
    let call_id=required_string(item,"call_id")?.to_string();
    let args=if mode==Mode::Native { item["arguments"].clone() }
        else { serde_json::from_str(required_string(item,"arguments")?).map_err(|_|"Invalid discovery arguments.")? };
    let query=required_string(&args,"query")?.to_string();
    if query.len()>2048 { return Err("Discovery query is too long.".into()); }
    Ok(Some(SearchCall{call_id,query}))
}

pub fn search_result(call: &SearchCall, mode: Mode, definitions: Vec<Value>) -> Value {
    if mode==Mode::Native { json!({"type":"tool_search_output","execution":"client","status":"completed","call_id":call.call_id,"tools":definitions}) }
    else { json!({"type":"function_call_output","call_id":call.call_id,"output":serde_json::to_string(&json!({"tools":definitions})).unwrap()}) }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn inventory() -> Inventory {
        let mut value=Inventory::parse(&[
            json!({"type":"function","name":"exec_command","parameters":{"type":"object"}}),
            json!({"type":"namespace","name":"mcp__node_repl","tools":[{"type":"function","name":"js","description":"Execute JavaScript in Node","parameters":{"type":"object"}}]}),
            json!({"type":"namespace","name":"mcp__gmail","tools":[{"type":"function","name":"search","description":"Find email messages","parameters":{"type":"object"}}]}),
        ]).unwrap();value.assign_aliases();value
    }
    #[test]
    fn unknown_models_keep_core_tools_without_loading_all_connectors() {
        let tools=inventory().declarations(Mode::Function,&BTreeSet::new());
        assert_eq!(tools.len(),1);assert_eq!(tools[0]["name"],"exec_command");
    }
    #[test]
    fn discovered_tool_can_roundtrip_to_the_clis_original_identity() {
        let inventory=inventory();let keys=inventory.search("node javascript",8);
        assert_eq!(keys,vec!["mcp__node_repl.js"]);
        let tools=inventory.declarations(Mode::Function,&BTreeSet::from_iter(keys));
        let js=tools.iter().find(|t|t["description"].as_str().is_some_and(|d|d.starts_with("mcp__node_repl.js"))).unwrap();
        let item=json!({"type":"function_call","id":"item","call_id":"call_exact","name":js["name"],"arguments":"{}"});
        let decoded=inventory.decode_call(&item,Mode::Function).unwrap();
        assert_eq!(decoded["namespace"],"mcp__node_repl");assert_eq!(decoded["name"],"js");assert_eq!(decoded["call_id"],"call_exact");
        let mut history=vec![decoded];inventory.encode_history(&mut history,Mode::Function).unwrap();assert_eq!(history[0],item);
    }
    #[test]
    fn native_and_function_discovery_require_structured_calls_not_http_success() {
        for mode in [Mode::Native,Mode::Function] {
            assert_eq!(search_call(&json!({"type":"message","content":"No tools available"}),mode).unwrap(),None);
            let mut item=if mode==Mode::Native { json!({"type":"tool_search_call","execution":"client","call_id":"call","arguments":{"query":"node"}}) }
                else { json!({"type":"function_call","name":SEARCH_NAME,"call_id":"call","arguments":"{\"query\":\"node\"}"}) };
            let call=search_call(&item,mode).unwrap().unwrap();assert_eq!(call.call_id,"call");
            assert_eq!(search_result(&call,mode,vec![])["call_id"],"call");
            item.as_object_mut().unwrap().remove("call_id");assert!(search_call(&item,mode).is_err());
        }
    }
    #[test]
    fn malformed_or_ambiguous_tool_definitions_fail_explicitly() {
        for spec in [json!({"type":"function","name":"bad"}),json!({"type":"namespace","name":"empty"}),json!({"type":"unknown"})] {
            assert!(Inventory::parse(&[spec]).is_err());
        }
        let spec=json!({"type":"function","name":"same","parameters":{}});
        assert!(Inventory::parse(&[spec.clone(),spec]).is_err());
    }
    #[test]
    fn every_passthrough_contract_kind_is_preserved_in_every_mode() {
        let covered=["custom","web_search","web_search_preview","image_generation","computer","computer_use_preview","code_interpreter","tool_search"];
        assert_eq!(BTreeSet::from_iter(PASSTHROUGH_TOOL_KINDS.iter().copied()),BTreeSet::from(covered));
        for kind in covered {
            let spec=json!({"type":kind,"name":"fixture","fixture_specific_settings":{"unchanged":true}});
            let inventory=Inventory::parse(std::slice::from_ref(&spec)).unwrap();
            for mode in [Mode::Native,Mode::Function,Mode::Direct] {assert_eq!(inventory.declarations(mode,&BTreeSet::new()),vec![spec.clone()]);}
        }
    }
    #[test]
    fn disconnected_history_is_portable_but_cannot_be_executed() {
        let inventory=Inventory::default();let mut history=vec![json!({"type":"function_call","namespace":"mcp__gone","name":"read","call_id":"historical","arguments":"{}"})];
        inventory.encode_history(&mut history,Mode::Function).unwrap();
        assert!(history[0].get("namespace").is_none());assert_eq!(history[0]["call_id"],"historical");
        assert!(inventory.decode_call(&history[0],Mode::Function).is_err());
    }
    #[test]
    fn namespaced_custom_core_tools_roundtrip_without_changing_their_grammar() {
        let spec=json!({"type":"custom","name":"apply_patch","description":"Apply a patch","format":{"type":"grammar","syntax":"lark","definition":"start: \"TEST\""}});
        let inventory=Inventory::parse(&[json!({"type":"namespace","name":"functions","tools":[spec]})]).unwrap();
        let tool=&inventory.tools["functions.apply_patch"];
        let declaration=inventory.declarations(Mode::Function,&BTreeSet::new()).pop().unwrap();assert_eq!(declaration["format"],tool.spec["format"]);
        let call=json!({"type":"custom_tool_call","name":tool.alias,"call_id":"custom","input":"TEST"});
        let decoded=inventory.decode_call(&call,Mode::Function).unwrap();assert_eq!(decoded["namespace"],"functions");assert_eq!(decoded["name"],"apply_patch");
        let mut history=vec![decoded];inventory.encode_history(&mut history,Mode::Function).unwrap();assert_eq!(history[0],call);
    }
    #[test]
    fn large_connector_catalog_is_not_preloaded_for_unknown_models() {
        let tools:Vec<_>=(0..263).map(|i|json!({"type":"function","name":format!("tool_{i}"),"description":"x".repeat(1000),"parameters":{"type":"object"}})).collect();
        let specs=vec![json!({"type":"function","name":"exec_command","parameters":{"type":"object"}}),json!({"type":"namespace","name":"mcp__apps","tools":tools})];
        let full=serde_json::to_vec(&specs).unwrap().len();let inventory=Inventory::parse(&specs).unwrap();
        for mode in [Mode::Native,Mode::Function,Mode::Direct] {
            let initial=inventory.declarations(mode,&BTreeSet::new());assert_eq!(initial.len(),1);assert!(serde_json::to_vec(&initial).unwrap().len()*100<full);
        }
        let selected=BTreeSet::from(["mcp__apps.tool_17".into()]);let exposed=inventory.declarations(Mode::Direct,&selected);
        assert_eq!(exposed.len(),2);assert!(exposed.iter().any(|tool|tool["name"]==inventory.tools["mcp__apps.tool_17"].alias));
    }
    #[test]
    fn direct_fallback_exposes_only_explicitly_selected_connectors() {
        let tools=inventory().declarations(Mode::Direct,&BTreeSet::from(["mcp__gmail.search".to_string()]));
        assert_eq!(tools.len(),2);assert!(tools.iter().any(|t|t["description"].as_str().is_some_and(|d|d.starts_with("mcp__gmail.search"))));
        assert!(!tools.iter().any(|t|t["description"].as_str().is_some_and(|d|d.starts_with("mcp__node_repl.js"))));
    }
}
