import { Provider as JotaiProvider } from "jotai"
import { createRoot } from "react-dom/client"
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom"
import { CssBaseline, ThemeProvider } from "@mui/material"
import App from "./App"
import theme from "./theme"
import "normalize.css"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <JotaiProvider>
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={["/"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <CssBaseline />
        <Routes>
          <Route path="/" element={<Navigate replace to={"/home"} />}></Route>
          <Route path="/*" element={<App />}></Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  </JotaiProvider>
)
