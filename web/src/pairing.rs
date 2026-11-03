//! Single-use pairing codes with optionally persistent device authorization.
//! Only token hashes are stored; pairing codes and raw device tokens are not.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use std::{io::{self, Read, Write}, path::{Path, PathBuf}};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use uuid::Uuid;

const PAIRING_LIFETIME: Duration = Duration::from_secs(120);
const MAX_ATTEMPTS: u8 = 8;

struct PendingCode {
    value: String,
    expires: Instant,
    attempts: u8,
}

#[derive(Default)]
struct PairingState {
    pending: Option<PendingCode>,
    devices: HashMap<Uuid, String>,
}

/// Pairing codes remain process-local. Device hashes may survive restarts.
#[derive(Default)]
pub struct Pairing {
    state: Mutex<PairingState>,
    storage: Option<PathBuf>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct DeviceLedger {
    version: u8,
    devices: HashMap<Uuid, String>,
}

pub(crate) fn read_limited(path: &Path, limit: u64) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    std::fs::File::open(path)?.take(limit + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit { return Err(io::Error::other("Stored LAN data exceeds size limit")); }
    Ok(bytes)
}

pub(crate) fn write_json(path: &Path, value: &impl Serialize) -> io::Result<()> {
    let parent = path.parent().ok_or_else(|| io::Error::other("Missing storage directory"))?;
    std::fs::create_dir_all(parent)?;
    let mut file = tempfile::NamedTempFile::new_in(parent)?;
    serde_json::to_writer(&mut file, value).map_err(io::Error::other)?;
    file.flush()?;
    file.as_file().sync_all()?;
    file.persist(path).map_err(|error| error.error)?;
    Ok(())
}

fn token_hash(token: &str) -> String { format!("{:x}", Sha256::digest(token.as_bytes())) }

/// Secret returned once to a newly paired device.
pub struct PairedDevice {
    pub id: Uuid,
    pub token: String,
}

fn random_secret() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

fn secrets_equal(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

impl Pairing {
    pub fn open(path: PathBuf) -> io::Result<Self> {
        let devices = match read_limited(&path, 1024 * 1024) {
            Ok(bytes) => {
                let ledger: DeviceLedger = serde_json::from_slice(&bytes)
                    .map_err(|_| io::Error::other("Invalid device ledger"))?;
                if ledger.version != 1 || ledger.devices.len() > 64 || ledger.devices.values().any(|hash| hash.len()!=64 || !hash.bytes().all(|b| b.is_ascii_hexdigit())) {
                    return Err(io::Error::other("Unsupported or invalid device ledger"));
                }
                ledger.devices
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => HashMap::new(),
            Err(error) => return Err(error),
        };
        Ok(Self { state: Mutex::new(PairingState { pending: None, devices }), storage: Some(path) })
    }

    fn save(&self, devices: &HashMap<Uuid, String>) -> io::Result<()> {
        if let Some(path) = &self.storage { write_json(path, &DeviceLedger { version: 1, devices: devices.clone() })?; }
        Ok(())
    }

    /// Replaces any outstanding code. Codes expire after two minutes.
    pub fn issue_code(&self) -> String {
        let code = Uuid::new_v4().simple().to_string()[..8].to_ascii_uppercase();
        let mut state = self.state.lock().expect("pairing lock poisoned");
        state.pending = Some(PendingCode {
            value: code.clone(),
            expires: Instant::now() + PAIRING_LIFETIME,
            attempts: 0,
        });
        code
    }

    /// Atomically consumes a valid code and issues an independent device token.
    pub fn pair(&self, code: &str) -> Option<PairedDevice> {
        self.try_pair(code).ok().flatten()
    }

    pub fn try_pair(&self, code: &str) -> io::Result<Option<PairedDevice>> {
        let mut state = self.state.lock().expect("pairing lock poisoned");
        let Some(pending) = state.pending.as_mut() else { return Ok(None); };
        if Instant::now() >= pending.expires || pending.attempts >= MAX_ATTEMPTS {
            state.pending = None;
            return Ok(None);
        }
        if !secrets_equal(&pending.value, &code.trim().to_ascii_uppercase()) {
            pending.attempts += 1;
            if pending.attempts >= MAX_ATTEMPTS {
                state.pending = None;
            }
            return Ok(None);
        }
        state.pending = None;
        if state.devices.len() >= 64 { return Err(io::Error::other("Paired device limit reached")); }
        let device = PairedDevice { id: Uuid::new_v4(), token: random_secret() };
        let mut devices = state.devices.clone();
        devices.insert(device.id, token_hash(&device.token));
        self.save(&devices)?;
        state.devices = devices;
        Ok(Some(device))
    }

    pub fn is_authorized(&self, id: Uuid, token: &str) -> bool {
        self.state.lock().expect("pairing lock poisoned").devices.get(&id)
            .is_some_and(|expected| secrets_equal(expected, &token_hash(token)))
    }

    pub fn revoke(&self, id: Uuid) -> bool {
        let mut state = self.state.lock().expect("pairing lock poisoned");
        let mut devices = state.devices.clone();
        if devices.remove(&id).is_none() || self.save(&devices).is_err() { return false; }
        state.devices = devices;
        true
    }

    pub fn revoke_all(&self) -> io::Result<()> {
        let mut state = self.state.lock().expect("pairing lock poisoned");
        self.save(&HashMap::new())?;
        state.pending = None;
        state.devices.clear();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_is_single_use_and_devices_are_independently_revocable() {
        let pairing = Pairing::default();
        let code = pairing.issue_code();
        let first = pairing.pair(&code).expect("first device");
        assert!(pairing.pair(&code).is_none());
        let second = pairing.pair(&pairing.issue_code()).expect("second device");
        assert!(pairing.is_authorized(first.id, &first.token));
        assert!(!pairing.is_authorized(first.id, &second.token));
        assert!(pairing.revoke(first.id));
        assert!(!pairing.is_authorized(first.id, &first.token));
        assert!(pairing.is_authorized(second.id, &second.token));
        pairing.revoke_all().unwrap();
        assert!(!pairing.is_authorized(second.id, &second.token));
    }

    #[test]
    fn replacing_code_expiration_and_failed_attempts_prevent_pairing() {
        let pairing = Pairing::default();
        let old = pairing.issue_code();
        let new = pairing.issue_code();
        assert!(pairing.pair(&old).is_none());
        assert!(pairing.pair(&new).is_some());
        let code = pairing.issue_code();
        for _ in 0..MAX_ATTEMPTS { assert!(pairing.pair("incorrect").is_none()); }
        assert!(pairing.pair(&code).is_none());
        let expired = pairing.issue_code();
        pairing.state.lock().unwrap().pending.as_mut().unwrap().expires = Instant::now();
        assert!(pairing.pair(&expired).is_none());
    }

    #[test]
    fn revoke_all_invalidates_pending_codes() {
        let pairing = Pairing::default();
        let code = pairing.issue_code();
        pairing.revoke_all().unwrap();
        assert!(pairing.pair(&code).is_none());
    }

    #[test]
    fn simultaneous_pairing_consumes_code_only_once() {
        let pairing = std::sync::Arc::new(Pairing::default());
        let code = pairing.issue_code();
        let gate = std::sync::Arc::new(std::sync::Barrier::new(3));
        let threads: Vec<_> = (0..2).map(|_| {
            let pairing = pairing.clone();
            let gate = gate.clone();
            let code = code.clone();
            std::thread::spawn(move || {
                gate.wait();
                pairing.pair(&code).is_some()
            })
        }).collect();
        gate.wait();
        let successes = threads.into_iter().map(|thread| thread.join().unwrap()).filter(|ok| *ok).count();
        assert_eq!(successes, 1);
    }

    #[test]
    fn persistent_devices_survive_reopen_but_codes_and_revoked_devices_do_not() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("devices.json");
        let pairing = Pairing::open(path.clone()).unwrap();
        let first = pairing.try_pair(&pairing.issue_code()).unwrap().unwrap();
        let second = pairing.try_pair(&pairing.issue_code()).unwrap().unwrap();
        let code = pairing.issue_code();
        let saved = std::fs::read_to_string(&path).unwrap();
        assert!(!saved.contains(&first.token));
        assert!(!saved.contains(&second.token));
        assert!(!saved.contains(&code));
        drop(pairing);
        let pairing = Pairing::open(path.clone()).unwrap();
        assert!(pairing.is_authorized(first.id, &first.token));
        assert!(!pairing.is_authorized(first.id, &second.token));
        assert!(pairing.try_pair(&code).unwrap().is_none());
        assert!(pairing.revoke(first.id));
        drop(pairing);
        let pairing = Pairing::open(path.clone()).unwrap();
        assert!(!pairing.is_authorized(first.id, &first.token));
        assert!(pairing.is_authorized(second.id, &second.token));
        pairing.revoke_all().unwrap();
        let pairing = Pairing::open(path).unwrap();
        assert!(!pairing.is_authorized(second.id, &second.token));
    }

    #[test]
    fn invalid_storage_fails_closed_and_unsaved_pairing_is_never_authorized() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("devices.json");
        std::fs::write(&path, r#"{"version":99,"devices":{}}"#).unwrap();
        assert!(Pairing::open(path.clone()).is_err());
        std::fs::write(&path, "not json").unwrap();
        assert!(Pairing::open(path.clone()).is_err());
        std::fs::remove_file(&path).unwrap();
        let pairing = Pairing::open(path.clone()).unwrap();
        std::fs::create_dir(&path).unwrap();
        assert!(pairing.try_pair(&pairing.issue_code()).is_err());
        assert!(pairing.state.lock().unwrap().devices.is_empty());
        assert!(pairing.revoke_all().is_err());
    }
}
