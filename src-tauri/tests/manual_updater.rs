
use tauri_plugin_updater::UpdaterExt;
const PUBLIC_KEY:&str=include_str!("../updater.pub");
    use base64::Engine;
    use serde_json::json;
    // Public throwaway test vectors from tauri-plugin-updater 2.14.0 (Apache-2.0/MIT).
    // The production release private key is never used for tests.
    const TEST_KEY:&str="untrusted comment: minisign public key: A49EF4746FA6E6D7\nRWTX5qZvdPSepDGWg2bz8n6ArQnBMwgQK1geVosorcbLzcunD+KJ+cYe";
    const TEST_SIG:&str="untrusted comment: signature from tauri secret key\nRUTX5qZvdPSepPF2zsjvP/L/TQtBLRnWRvaq+4omK1UEugtQp/USrGiI1v762sDy3id3aor7bRC9ETyeot6lMHHrWoZ5hjUM1Qc=\ntrusted comment: timestamp:1791649051\tfile:payload\tversion:2.0.0\nDDq2CLOEl5cQmC2eJRHlnZPVViOZsu1CjpPKQoei4A/XBfkDqGO0B+QMrcrHgEQ5qV3mne75tdFWhJpqUXh9AA==";
    fn encoded(value:&str)->String {base64::engine::general_purpose::STANDARD.encode(value)}
    #[test]
    fn configured_public_key_matches_and_version_binding_is_required(){
        let config:serde_json::Value=serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert!(!PUBLIC_KEY.trim().is_empty());assert_eq!(config["plugins"]["updater"]["pubkey"],PUBLIC_KEY.trim());
        assert_eq!(config["plugins"]["updater"]["requireSignedVersion"],true);
        assert_eq!(config["plugins"]["updater"]["endpoints"],serde_json::Value::Null);
    }
    #[test]
    fn real_updater_verification_rejects_tampered_bytes_and_versions_without_network(){
        let mut context=tauri::test::mock_context(tauri::test::noop_assets());
        context.config_mut().plugins.0.insert("updater".into(),json!({"pubkey":encoded(TEST_KEY),"requireSignedVersion":true}));
        let app=tauri::test::mock_builder().plugin(tauri_plugin_updater::Builder::new().build()).build(context).unwrap();
        let updater=app.updater_builder().target("fixture").endpoints(vec!["https://example.invalid/manifest".parse().unwrap()]).unwrap().configure_client(|_|panic!("Unexpected update network request")).build().unwrap();
        let mut manifest=json!({"version":"2.0.0","platforms":{"fixture":{"url":"https://github.com/liangshaobo2001/codex-lemma/releases/download/v2.0.0/fixture.exe","signature":encoded(TEST_SIG)}}});
        let update=updater.restore_update(manifest.clone()).unwrap().unwrap();update.verify(b"test").unwrap();
        assert!(update.verify(b"tampered").is_err());assert!(update.install(b"tampered").is_err());
        manifest["version"]=json!("3.0.0");let changed=updater.restore_update(manifest.clone()).unwrap().unwrap();assert!(changed.verify(b"test").is_err());
        manifest["version"]=json!("0.0.0");assert!(updater.restore_update(manifest).unwrap().is_none());
    }

#[test]
#[ignore = "Requires the freshly packaged signed installer; run explicitly in release validation"]
fn packaged_installer_matches_its_signature_version_and_manifest(){
    let directory=std::path::PathBuf::from(std::env::var("LEMMA_RELEASE_VERIFY_DIR").expect("LEMMA_RELEASE_VERIFY_DIR must name the release assets directory"));
    let manifest:serde_json::Value=serde_json::from_slice(&std::fs::read(directory.join("latest.json")).unwrap()).unwrap();
    assert_eq!(manifest["version"],env!("CARGO_PKG_VERSION"));
    let filename=format!("Codex-Lemma_{}_x64-setup.exe",env!("CARGO_PKG_VERSION"));
    let asset=&manifest["platforms"]["windows-x86_64"];
    assert_eq!(asset["url"],format!("https://github.com/liangshaobo2001/codex-lemma/releases/download/v{}/{filename}",env!("CARGO_PKG_VERSION")));
    assert_eq!(asset["signature"].as_str().unwrap(),std::fs::read_to_string(directory.join(format!("{filename}.sig"))).unwrap().trim());
    let mut context=tauri::test::mock_context(tauri::test::noop_assets());
    context.config_mut().plugins.0.insert("updater".into(),json!({"pubkey":PUBLIC_KEY.trim(),"requireSignedVersion":true}));
    let app=tauri::test::mock_builder().plugin(tauri_plugin_updater::Builder::new().build()).build(context).unwrap();
    let updater=app.updater_builder().target("windows-x86_64").endpoints(vec!["https://example.invalid/unused".parse().unwrap()]).unwrap().configure_client(|_|panic!("Verification must not access the network")).build().unwrap();
    let update=updater.restore_update(manifest).unwrap().unwrap();let mut bytes=std::fs::read(directory.join(filename)).unwrap();
    update.verify(&bytes).unwrap();bytes[0]^=1;assert!(update.verify(&bytes).is_err());
}
