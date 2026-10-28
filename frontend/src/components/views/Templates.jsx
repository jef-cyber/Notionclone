import React from "react";

import { store } from "../../core/store.js";
import { templates } from "../../core/data.js";
import { showToast } from "../ui/index.jsx";
import { useApp } from "../../appContext.js";
import ViewHeader from "../common/ViewHeader.jsx";

export default function Templates() {
  const app = useApp();

  const createFromTemplate = async (template) => {
    try {
      const page = await store.createPage({
        title: template.name,
        icon: template.icon,
        blocks: template.blocks,
      });
      showToast('Page created from "' + template.name + '"', "success");
      app.openPage(page.id);
    } catch (err) {
      showToast(err.message || "Could not create the page", "error");
    }
  };

  return (
    <div className="view">
      <ViewHeader
        title="Templates"
        subtitle="Start from a template — it becomes a real page you can edit."
      />
      <div className="template-grid" id="template-grid">
        {templates.map((template, i) => (
          <button
            className="template-card"
            key={template.id}
            onClick={() => createFromTemplate(template)}
          >
            <div
              className="template-preview"
              data-tone={template.tone !== undefined ? template.tone : i % 5}
            >
              {template.icon}
            </div>
            <div className="template-info">
              <div className="template-name">{template.name}</div>
              <div className="template-desc">{template.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
