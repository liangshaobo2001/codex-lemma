pub mod watcher;
pub mod auth;
pub mod events;
mod handlers;
pub mod router;
mod server;
pub mod terminal;
pub mod types;
mod websocket;
mod server_web;

pub use router::create_router;
pub use types::WebServerState;
pub use server_web::serve_api;
