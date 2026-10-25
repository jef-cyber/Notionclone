import React, { useEffect, useState } from "react";

import { useStore } from "../../hooks.js";
import { store } from "../../core/store.js";
import * as api from "../../core/api.js";
import theme from "../../core/theme.js";
import { Icon, initials, showToast } from "../ui/index.jsx";

const TABS = [
  { id: "account", label: "My Account" },
  { id: "appearance", label: "Appearance" },
  { id: "prefs", label: "Preferences" },
  { id: "about", label: "About" },
];

function ThemeOption({ value, label, desc, active }) {
  const icon = value === "light" ? "sun" : value === "dark" ? "moon" : "monitor";
  return (
    <button
      className="theme-option"
      data-theme-option={value}
      data-active={active ? "true" : "false"}
      onClick={() => theme.setTheme(value)}
    >
      <div className={"theme-option-preview preview-" + value}>
        <Icon name={icon} />
      </div>
      <div className="theme-option-label">{label}</div>
      <div className="theme-option-desc">{desc}</div>
    </button>
  );
}

function Switch({ id, checked, onChange }) {
  return (
    <label className="switch">
      <input type="checkbox" id={id} checked={checked} onChange={onChange} />
      <span className="track" />
    </label>
  );
}

export default function Settings() {
  const state = useStore();
  const settings = state.settings;
  const user = state.user;
  const [tab, setTab] = useState("account");
  const [name, setName] = useState(user.name || "");
  const [email, setEmail] = useState(user.email || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(user.name || "");
    setEmail(user.email || "");
  }, [user.name, user.email]);

  const saveProfile = async () => {
    if (saving) return;
    const nextName = name.trim();
    const nextEmail = email.trim();
    if (!nextName || !nextEmail) {
      showToast("Name and email are required", "error");
      return;
    }
    setSaving(true);
    try {
      const data = await api.auth.updateProfile({ name: nextName, email: nextEmail });
      store.updateUser(data.user);
      showToast("Profile updated", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const updatePreference = (patch) => {
    store.updateSettings(patch, "settings");
    showToast("Settings updated", "success");
  };

  return (
    <div className="view view-narrow">
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Settings</h1>
      <p className="dash-date">Manage your account, appearance, and preferences.</p>

      <div className="settings-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            className="settings-tab"
            data-tab={item.id}
            data-active={tab === item.id ? "true" : "false"}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div id="settings-body">
        {tab === "account" ? (
          <div className="settings-section">
            <h2 className="settings-section-title">My Account</h2>
            <p className="settings-section-desc">
              Your profile is stored in the <code>users</code> collection.
            </p>
            <div className="avatar-edit">
              <span className="avatar avatar-lg" id="settings-avatar">
                {initials(user.name)}
              </span>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="f-name">Name</label>
                <input id="f-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="f-email">Email</label>
              <input
                id="f-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f-workspace">Workspace</label>
              <input id="f-workspace" value={state.workspace.name || ""} disabled readOnly />
            </div>
            <div className="field">
              <label htmlFor="f-role">Your role</label>
              <input
                id="f-role"
                value={state.workspace.role || "member"}
                disabled
                readOnly
              />
            </div>
            <button
              className="btn btn-primary"
              data-save-profile
              disabled={saving}
              onClick={saveProfile}
            >
              Save changes
            </button>
          </div>
        ) : null}

        {tab === "appearance" ? (
          <div className="settings-section">
            <h2 className="settings-section-title">Appearance</h2>
            <p className="settings-section-desc">Choose how Lumen looks.</p>
            <div className="theme-options">
              <ThemeOption
                value="light"
                label="Light"
                desc="Sunny and bright"
                active={settings.theme === "light"}
              />
              <ThemeOption
                value="dark"
                label="Dark"
                desc="Easy on the eyes"
                active={settings.theme === "dark"}
              />
              <ThemeOption
                value="system"
                label="System"
                desc="Match your OS"
                active={settings.theme === "system"}
              />
            </div>
          </div>
        ) : null}

        {tab === "prefs" ? (
          <div className="settings-section">
            <h2 className="settings-section-title">Preferences</h2>
            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-row-title">Sidebar behavior</div>
                <div className="settings-row-desc">Choose how the sidebar responds.</div>
              </div>
              <select
                id="pref-sidebar"
                className="select"
                value={settings.sidebarBehavior === "fixed" ? "fixed" : "collapsible"}
                onChange={(e) => updatePreference({ sidebarBehavior: e.target.value })}
              >
                <option value="collapsible">Collapsible</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>
            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-row-title">Compact mode</div>
                <div className="settings-row-desc">Reduce spacing throughout the app.</div>
              </div>
              <Switch
                id="pref-compact"
                checked={!!settings.compactMode}
                onChange={(e) => updatePreference({ compactMode: e.target.checked })}
              />
            </div>
            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-row-title">Animations</div>
                <div className="settings-row-desc">Enable subtle interface animations.</div>
              </div>
              <Switch
                id="pref-anim"
                checked={settings.animations !== false}
                onChange={(e) => updatePreference({ animations: e.target.checked })}
              />
            </div>
          </div>
        ) : null}

        {tab === "about" ? (
          <div className="settings-section">
            <h2 className="settings-section-title">About</h2>
            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-row-title">Application</div>
                <div className="settings-row-desc">{state.app.name}</div>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-row-title">Version</div>
                <div className="settings-row-desc">{state.app.version}</div>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-row-title">Tech</div>
                <div className="settings-row-desc">
                  React, CSS and JavaScript, with an Express + MongoDB API.
                </div>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-row-title">Storage</div>
                <div className="settings-row-desc">
                  Six collections: users, workspaces, workspaceMembers, pages, blocks,
                  dataTable.
                </div>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-row-title">API</div>
                <div className="settings-row-desc">{api.baseUrl()}</div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
