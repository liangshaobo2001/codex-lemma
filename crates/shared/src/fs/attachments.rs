//! Durable, bounded staging for files explicitly pasted or dropped into the composer.
use std::{io::Write, path::Path};
use serde::Serialize;

pub const MAX_ATTACHMENT_BYTES: usize = 32 * 1024 * 1024;
#[derive(Serialize)]
pub struct Attachment { pub path: String, pub name: String, pub kind: &'static str }

fn safe_name(name: &str) -> String {
    let leaf=name.rsplit(['/', '\\']).next().unwrap_or("attachment");
    let clean:String=leaf.chars().filter(|c| !c.is_control()).map(|c| if "<>:\"/\\|?*".contains(c) {'_'} else {c}).take(120).collect();
    let clean=clean.trim().trim_end_matches(['.', ' ']);
    if clean.is_empty() {"attachment".into()} else {clean.into()}
}
fn image_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {Some("png")}
    else if bytes.starts_with(b"\xff\xd8\xff") {Some("jpg")}
    else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {Some("gif")}
    else if bytes.starts_with(b"RIFF") && bytes.get(8..12)==Some(b"WEBP") {Some("webp")}
    else {None}
}
pub fn save_in(root: &Path, name: &str, bytes: &[u8]) -> Result<Attachment, String> {
    if bytes.len()>MAX_ATTACHMENT_BYTES {return Err("Each attachment must be 32 MiB or smaller.".into());}
    let name=safe_name(name);
    let extension=image_extension(bytes);
    let folder=root.join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&folder).map_err(|e| format!("Cannot create attachment storage: {e}"))?;
    let result=(|| {
        let filename=match extension {Some(ext)=>format!("image.{ext}"),None=>format!("file-{name}")};
        let path=folder.join(filename);
        let mut temporary=tempfile::NamedTempFile::new_in(&folder).map_err(|e| e.to_string())?;
        temporary.write_all(bytes).map_err(|e| e.to_string())?;
        temporary.persist(&path).map_err(|e| e.to_string())?;
        Ok(Attachment {path:path.to_string_lossy().into_owned(), name, kind:if extension.is_some(){"image"}else{"file"}})
    })();
    if result.is_err() {let _=std::fs::remove_dir(&folder);}
    result
}
pub fn save(name: &str, bytes: &[u8]) -> Result<Attachment,String> {
    let root=dirs::home_dir().ok_or("Cannot locate attachment storage.")?.join(".codex-lemma/attachments");
    save_in(&root,name,bytes)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_binary_and_prevents_path_escape_or_overwrite() {
        let root=tempfile::tempdir().unwrap();
        let a=save_in(root.path(),"../../CON.txt",b"\0\xffbinary").unwrap();
        let b=save_in(root.path(),"../../CON.txt",b"second").unwrap();
        assert_eq!(a.kind,"file");assert_ne!(a.path,b.path);
        assert!(Path::new(&a.path).starts_with(root.path()));
        assert_eq!(std::fs::read(&a.path).unwrap(),b"\0\xffbinary");
        assert_eq!(Path::new(&a.path).file_name().unwrap(),"file-CON.txt");
    }
    #[test]
    fn detects_image_bytes_not_untrusted_extension() {
        let root=tempfile::tempdir().unwrap();
        let a=save_in(root.path(),"capture.exe",b"\x89PNG\r\n\x1a\npixels").unwrap();
        assert_eq!(a.kind,"image");assert!(a.path.ends_with("image.png"));
        assert_eq!(save_in(root.path(),"fake.png",b"text").unwrap().kind,"file");
        assert!(save_in(root.path(),"large",&vec![0;MAX_ATTACHMENT_BYTES+1]).is_err());
    }
}
