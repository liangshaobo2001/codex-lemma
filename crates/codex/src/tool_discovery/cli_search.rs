//! Adapt a CLI-owned native search without replacing the CLI's search handler or tool execution.
use super::protocol::{Inventory,Mode,SEARCH_NAME};
use serde_json::{Value,json};
use std::collections::{BTreeMap,BTreeSet};

fn call_id(item:&Value) -> Result<&str,String> {
    item["call_id"].as_str().filter(|s|!s.is_empty()).ok_or("Search item has no call_id.".into())
}
fn merge(tools:&mut BTreeMap<(String,String),Value>,spec:&Value,history:bool) -> Result<(),String> {
    let kind=spec["type"].as_str().ok_or("Tool definition has no type.")?;
    let name=spec["name"].as_str().unwrap_or("");
    let key=(kind.to_string(),name.to_string());
    if let Some(old)=tools.get_mut(&key) {
        if kind=="namespace" {
            let children=spec["tools"].as_array().ok_or("Namespace has no tools.")?;
            let old_children=old["tools"].as_array_mut().ok_or("Namespace has no tools.")?;
            for child in children {
                let name=child["name"].as_str().ok_or("Namespace child has no name.")?;
                if let Some(previous)=old_children.iter().find(|item|item["name"]==name) {
                    if !history && previous!=child { return Err("Conflicting namespace tool definitions.".into()); }
                } else { old_children.push(child.clone()); }
            }
        } else if !history && old!=spec { return Err("Conflicting tool definitions.".into()); }
    } else { tools.insert(key,spec.clone()); }
    Ok(())
}

pub struct Adapter { pub inventory:Inventory, mode:Mode, search_ids:BTreeSet<String>, known_ids:BTreeSet<String>, allowed:BTreeSet<String> }
impl Adapter {
    pub fn prepare(mut body:Value,mode:Mode,fallback:&BTreeSet<String>,fallback_specs:&[Value]) -> Result<(Self,Value),String> {
        let mut definitions=BTreeMap::new();let mut search=None;
        for spec in body["tools"].as_array().ok_or("Request has no tools array.")? {
            if spec["type"]=="tool_search" { search=Some(spec.clone()); }
            else { merge(&mut definitions,spec,false)?; }
        }
        for item in body["input"].as_array().ok_or("Request input is not an array.")? {
            if matches!(item["type"].as_str(),Some("additional_tools"|"tool_search_output")) {
                for tool in item["tools"].as_array().ok_or("Loaded tools are not an array.")? { merge(&mut definitions,tool,true)?; }
            }
        }
        if mode==Mode::Direct {for spec in fallback_specs { merge(&mut definitions,spec,true)?; }}
        let specs:Vec<_>=definitions.into_values().collect();let inventory=Inventory::parse(&specs)?;
        let loaded=if mode==Mode::Direct { fallback.clone() } else { inventory.tools.values().filter(|t|t.deferred).map(|t|t.key.clone()).collect() };
        let mut tools=inventory.declarations(mode,&loaded);
        if mode==Mode::Function {
            let spec=search.ok_or("The CLI did not declare its search protocol.")?;
            tools.push(json!({"type":"function","name":SEARCH_NAME,"description":spec["description"],"parameters":spec["parameters"]}));
        } else if mode==Mode::Native && let Some(spec)=search { tools.push(spec); }
        body["tools"]=json!(tools);
        body["input"]=json!(normalize_history(body["input"].as_array().unwrap(),&inventory,mode)?);
        Ok((Self{inventory,mode,search_ids:BTreeSet::new(),known_ids:BTreeSet::new(),allowed:loaded},body))
    }

    fn item(&mut self,item:&Value) -> Result<Value,String> {
        if let Some(id)=item["id"].as_str() {self.known_ids.insert(id.into());}
        if self.mode==Mode::Function && item["type"]=="function_call" && item["name"]==SEARCH_NAME {
            let args=item["arguments"].as_str().unwrap_or("{}");
            let args:Value=if args.is_empty() {json!({})} else {serde_json::from_str(args).map_err(|_|"Search function returned invalid JSON arguments.")?};
            if !args.is_object() { return Err("Search function arguments must be an object.".into()); }
            if let Some(id)=item["id"].as_str() { self.search_ids.insert(id.into()); }
            let mut result=item.clone();result["type"]=json!("tool_search_call");result["execution"]=json!("client");result["arguments"]=args;
            call_id(item)?;result.as_object_mut().unwrap().remove("name");result.as_object_mut().unwrap().remove("namespace");return Ok(result);
        }
        let result=self.inventory.decode_call(item,self.mode)?;
        if result["type"]=="function_call" && self.mode==Mode::Direct {
            let key=result["namespace"].as_str().map_or_else(||result["name"].as_str().unwrap_or("").to_string(),|n|format!("{n}.{}",result["name"].as_str().unwrap_or("")));
            if self.inventory.tools.get(&key).is_some_and(|t|t.deferred) && !self.allowed.contains(&key) { return Err("The model called an unselected fallback tool.".into()); }
        }
        Ok(result)
    }

    pub fn event(&mut self,mut event:Value) -> Result<Option<Value>,String> {
        if event["item"].is_object() { event["item"]=self.item(&event["item"])?; }
        if event["type"].as_str().is_some_and(|kind|kind.starts_with("response.function_call_arguments.")) && !event["item_id"].as_str().is_some_and(|id|self.known_ids.contains(id)) {
            return Err("The provider streamed function arguments before identifying the call.".into());
        }
        if event["item_id"].as_str().is_some_and(|id|self.search_ids.contains(id)) && event["type"].as_str().is_some_and(|kind|kind.starts_with("response.function_call_arguments.")) { return Ok(None); }
        if let Some(output)=event.pointer_mut("/response/output").and_then(Value::as_array_mut) {
            for item in output { *item=self.item(item)?; }
        }
        Ok(Some(event))
    }
}

pub fn normalize_history(items:&[Value],inventory:&Inventory,mode:Mode) -> Result<Vec<Value>,String> {
        let mut input=Vec::new();
        for item in items {
            match item["type"].as_str() {
                Some("additional_tools")=>{},
                Some("tool_search_call") if mode!=Mode::Native=>{
                    if item["execution"]!="client" || !item["arguments"].is_object() { return Err("Unsupported native search history.".into()); }
                    input.push(json!({"type":"function_call","call_id":call_id(item)?,"name":SEARCH_NAME,"arguments":item["arguments"].to_string()}));
                },
                Some("tool_search_output") if mode!=Mode::Native=>{
                    if item["execution"]!="client" { return Err("Unsupported native search output.".into()); }
                    let names:Vec<_>=item["tools"].as_array().unwrap().iter().flat_map(|spec| {
                        if spec["type"]=="namespace" { spec["tools"].as_array().into_iter().flatten().map(|t|format!("{}.{}",spec["name"].as_str().unwrap_or(""),t["name"].as_str().unwrap_or(""))).collect() }
                        else { vec![spec["name"].as_str().unwrap_or("").to_string()] }
                    }).collect();
                    input.push(json!({"type":"function_call_output","call_id":call_id(item)?,"output":json!({"discovered_tools":names,"note":"Use the complete definitions in the current tools list."}).to_string()}));
                },
                Some("tool_search_output") if mode==Mode::Native=>{
                    let mut result=item.clone();let mut keys=BTreeSet::new();
                    for spec in item["tools"].as_array().ok_or("Native search output has no tools array.")? {
                        if spec["type"]=="namespace" {
                            for child in spec["tools"].as_array().ok_or("Loaded namespace has no tools array.")? {
                                keys.insert(format!("{}.{}",spec["name"].as_str().unwrap_or(""),child["name"].as_str().unwrap_or("")));
                            }
                        } else if let Some(name)=spec["name"].as_str() { keys.insert(name.to_string()); }
                    }
                    result["tools"]=json!(inventory.discoveries(mode,&keys));input.push(result);
                },
                _=>input.push(item.clone()),
            }
        }
        inventory.encode_history(&mut input,mode)?;Ok(input)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_history_is_converted_and_same_namespace_conflicts_are_not_silently_ignored() {
        let definition=json!({"type":"namespace","name":"mcp__node","tools":[{"type":"function","name":"js","parameters":{"type":"object"}}]});
        let request=json!({"tools":[{"type":"tool_search","execution":"client","description":"Find tools","parameters":{"type":"object"}}],"input":[
            {"type":"tool_search_call","execution":"client","call_id":"exact","arguments":{"query":"node"}},
            {"type":"tool_search_output","execution":"client","call_id":"exact","tools":[definition]}]});
        let (_,body)=Adapter::prepare(request,Mode::Function,&BTreeSet::new(),&[]).unwrap();
        assert_eq!(body["input"][0]["type"],"function_call");assert_eq!(body["input"][1]["call_id"],"exact");
        assert!(body["tools"].as_array().unwrap().iter().any(|t|t["description"].as_str().is_some_and(|s|s.starts_with("mcp__node.js"))));
        let mut definitions=BTreeMap::new();merge(&mut definitions,&definition,false).unwrap();
        let mut conflicting=definition;conflicting["tools"][0]["parameters"]=json!({"type":"object","required":["different"]});
        assert!(merge(&mut definitions,&conflicting,false).is_err());
    }
    #[test]
    fn streamed_search_calls_keep_ids_and_arguments_while_suppressing_function_deltas() {
        let request=json!({"tools":[{"type":"tool_search","description":"Search","parameters":{"type":"object"}}],"input":[]});
        let (mut adapter,_)=Adapter::prepare(request,Mode::Function,&BTreeSet::new(),&[]).unwrap();
        let added=json!({"type":"response.output_item.added","output_index":0,"item":{"id":"search","type":"function_call","name":SEARCH_NAME,"call_id":"call_exact","arguments":""}});
        assert_eq!(adapter.event(added).unwrap().unwrap()["item"]["arguments"],json!({}));
        assert!(adapter.event(json!({"type":"response.function_call_arguments.delta","item_id":"search","delta":"partial"})).unwrap().is_none());
        let done=json!({"type":"response.output_item.done","output_index":0,"item":{"id":"search","type":"function_call","name":SEARCH_NAME,"call_id":"call_exact","arguments":"{\"limit\":5,\"query\":\"node\"}"}});
        let converted=adapter.event(done).unwrap().unwrap();assert_eq!(converted["item"]["type"],"tool_search_call");assert_eq!(converted["item"]["call_id"],"call_exact");assert_eq!(converted["item"]["arguments"]["limit"],5);
    }
}
