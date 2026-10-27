//! Automatic tool discovery for custom Responses providers.
pub mod protocol;
pub mod wire;
pub mod probe;
mod provider_error;
mod image_compat;
pub mod relay;
pub mod gateway;
pub mod cli_search;
pub mod binding;
pub mod session_tools;
pub(crate) mod observation;
