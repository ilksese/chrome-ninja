import routes from "~react-pages"
import NavigationBar from "@components/NavigationBar"
import { useRoutes } from "react-router-dom"

function App() {
  return (
    <>
      <div className="flex-1 p-4">{useRoutes(routes)}</div>
      <div className="flex-[0]">
        <NavigationBar />
      </div>
    </>
  )
}

export default App
