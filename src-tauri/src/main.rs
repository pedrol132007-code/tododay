#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_sql::{Migration, MigrationKind};

fn main() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "init_schema",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "members_status",
            sql: include_str!("../migrations/0002_members_status.sql"),
            kind: MigrationKind::Up,
        },
    ];

    // Dev builds get their own database file so running an unmerged branch never applies
    // its migrations to the real kanban.db the installed app depends on.
    let db_url = if cfg!(debug_assertions) {
        "sqlite:kanban-dev.db"
    } else {
        "sqlite:kanban.db"
    };

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(db_url, migrations)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
