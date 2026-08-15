import { Provider as JotaiProvider } from "jotai"
import { render } from "preact"
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom"
import { rootStore } from "@store"
import App from "./App"
import { connectHmrClient } from "./hmr/client"
import "normalize.css"
import "./index.css"

document.documentElement.dataset.layout = "popup"

render(
  <JotaiProvider store={rootStore}>
    <MemoryRouter initialEntries={["/"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <Routes>
        <Route path="/" element={<Navigate replace to={"/home"} />}></Route>
        <Route path="/*" element={<App layout="popup" />}></Route>
      </Routes>
    </MemoryRouter>
  </JotaiProvider>,
  document.getElementById("root")!
)
connectHmrClient("popup")
