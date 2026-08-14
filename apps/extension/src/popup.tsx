import { Provider as JotaiProvider } from "jotai"
import { render } from "preact"
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom"
import { rootStore } from "@store"
import App from "./App"
import "normalize.css"
import "./index.css"

render(
  <JotaiProvider store={rootStore}>
    <MemoryRouter initialEntries={["/"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <Routes>
        <Route path="/" element={<Navigate replace to={"/home"} />}></Route>
        <Route path="/*" element={<App />}></Route>
      </Routes>
    </MemoryRouter>
  </JotaiProvider>,
  document.getElementById("root")!
)
