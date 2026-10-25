/* Shared UI toolkit: components, helpers and imperative UI queues. */

import React from "react";

import { Icon } from "./Icon.jsx";
import { copyToClipboard, initials, isApple, isMobile, relativeTime } from "./helpers.js";
import { closeMenus, openMenu } from "./Menu.jsx";
import { closeModal, confirmDialog, openModal } from "./Modal.jsx";
import { showToast } from "./Toast.jsx";

export * from "./Icon.jsx";
export * from "./helpers.js";
export * from "./Toast.jsx";
export * from "./Menu.jsx";
export * from "./Modal.jsx";
export { createStore } from "../../core/externalStore.js";

export const ui = {
  icon: (name, size) => <Icon name={name} size={size} />,
  initials,
  relativeTime,
  isApple,
  isMobile,
  copyToClipboard,
  showToast,
  openMenu,
  closeMenus,
  openModal,
  closeModal,
  confirmDialog,
};
