import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { orchestratorApiPlugin } from "./orchestrator-api-plugin";

export default defineConfig({
  plugins: [react(), orchestratorApiPlugin()],
  envDir: "../../",
});
