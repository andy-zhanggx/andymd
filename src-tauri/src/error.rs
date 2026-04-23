use serde::{Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CommandError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("serde error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("notify error: {0}")]
    Notify(String),

    #[error("trash error: {0}")]
    Trash(String),

    #[error("path is not inside workspace root")]
    PathEscape,

    #[error("file has been modified externally")]
    ExternalModification,

    #[error("{0}")]
    Other(String),
}

impl Serialize for CommandError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type CommandResult<T> = Result<T, CommandError>;
