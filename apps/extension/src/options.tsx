import { Provider as JotaiProvider } from "jotai"
import { render } from "preact"
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom"
import { rootStore } from "@store"
import App from "./App"
import "normalize.css"
import "./index.css"

document.documentElement.dataset.layout = "options"

render(
  <JotaiProvider store={rootStore}>
    <MemoryRouter initialEntries={["/settings"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <Routes>
        <Route path="/" element={<Navigate replace to="/settings" />}></Route>
        <Route path="/*" element={<App layout="options" />}></Route>
      </Routes>
    </MemoryRouter>
  </JotaiProvider>,
  document.getElementById("root")!
)
