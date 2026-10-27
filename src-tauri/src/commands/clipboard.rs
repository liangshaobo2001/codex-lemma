//! Windows Explorer exposes copied files as CF_HDROP, not browser clipboard files.
//! Called only for a user paste gesture, never polled in the background.
#[tauri::command]
pub fn read_clipboard_files() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    { windows::read_files() }
    #[cfg(not(windows))]
    { Ok(Vec::new()) }
}
#[cfg(windows)]
mod windows {
    use std::ffi::c_void;
    #[link(name="user32")]
    unsafe extern "system" {
        fn OpenClipboard(owner:*mut c_void)->i32;
        fn CloseClipboard()->i32;
        fn IsClipboardFormatAvailable(format:u32)->i32;
        fn GetClipboardData(format:u32)->*mut c_void;
    }
    #[link(name="shell32")]
    unsafe extern "system" {
        fn DragQueryFileW(drop:*mut c_void,index:u32,name:*mut u16,capacity:u32)->u32;
    }
    struct Clipboard;
    impl Drop for Clipboard {
        fn drop(&mut self) {
            // SAFETY: this guard exists only after successful OpenClipboard, on this thread.
            unsafe {CloseClipboard();}
        }
    }
    pub(super) fn read_files()->Result<Vec<String>,String> {
        // SAFETY: Win32 calls use a borrowed clipboard handle while locked; buffers
        // are sized from DragQueryFileW, and ownership remains with the clipboard.
        unsafe {
            if IsClipboardFormatAvailable(15)==0 {return Ok(Vec::new());}
            if OpenClipboard(std::ptr::null_mut())==0 {return Err("Clipboard is busy. Try pasting again.".into());}
            let _guard=Clipboard;
            let drop=GetClipboardData(15);
            if drop.is_null(){return Ok(Vec::new());}
            let count=DragQueryFileW(drop,u32::MAX,std::ptr::null_mut(),0);
            if count>20 {return Err("Paste at most 20 files at a time.".into());}
            let mut paths=Vec::new();
            for index in 0..count {
                let len=DragQueryFileW(drop,index,std::ptr::null_mut(),0);
                if len==0 || len>32767 {return Err("Clipboard contains an invalid file path.".into());}
                let mut buffer=vec![0u16;len as usize+1];
                let written=DragQueryFileW(drop,index,buffer.as_mut_ptr(),len+1);
                if written!=len {return Err("Clipboard file list changed. Try again.".into());}
                paths.push(String::from_utf16(&buffer[..len as usize]).map_err(|_| "Clipboard path is not valid Unicode.")?);
            }
            Ok(paths)
        }
    }
}
