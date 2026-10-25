import { createRoot } from "react-dom/client";

import "./styles/style.css";
import "./styles/sidebar.css";
import "./styles/editor.css";
import "./styles/database.css";
import "./styles/responsive.css";

import App from "./components/App.jsx";

createRoot(document.getElementById("root")).render(<App />);
