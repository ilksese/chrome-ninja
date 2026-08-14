import React from "react"
import { useLocation, useNavigate } from "react-router-dom"
import HomeIcon from "@mui/icons-material/Home"
import SettingsIcon from "@mui/icons-material/Settings"
import { BottomNavigation, BottomNavigationAction } from "@mui/material"

function NavigationBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const handleChange = (_: React.SyntheticEvent, v: string) => {
    navigate(v)
  }
  return (
    <BottomNavigation
      showLabels
      value={pathname}
      onChange={handleChange}
      sx={{ bgcolor: "#FAFBFC", borderTop: "1px solid #eee" }}>
      <BottomNavigationAction label="首页" value={"/home"} icon={<HomeIcon />} />
      <BottomNavigationAction label="设置" value={"/settings"} icon={<SettingsIcon />} />
    </BottomNavigation>
  )
}

export default NavigationBar
