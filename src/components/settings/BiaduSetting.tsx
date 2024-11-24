import type { SettingFormData } from "@/pages/Settings"
import { useState } from "react"
import SvgBaidu from "@assets/svg/baidu.svg?react"
import { useFormContext } from "react-hook-form"
import { Api, ExpandLess, ExpandMore } from "@mui/icons-material"
import { Collapse, List, ListItemButton, ListItemIcon, ListItemText, Switch } from "@mui/material"

export type BaiduSettingType = {
  clearSearch: boolean
}

function BaiduSetting() {
  const { register, watch } = useFormContext<SettingFormData>()
  const [open, setOpen] = useState(true)
  const baidu = watch("baidu")
  return (
    <>
      <ListItemButton onClick={() => setOpen((open) => !open)}>
        <ListItemIcon>
          <SvgBaidu width={24} height={24} />
        </ListItemIcon>
        <ListItemText primary="百度" />
        {open ? <ExpandLess /> : <ExpandMore />}
      </ListItemButton>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <List component="div" disablePadding>
          <ListItemButton sx={{ pl: 4 }}>
            <ListItemIcon>
              <Api />
            </ListItemIcon>
            <ListItemText primary="清爽搜索" />
            <Switch {...register("baidu.clearSearch")} checked={baidu.clearSearch} />
          </ListItemButton>
        </List>
      </Collapse>
    </>
  )
}

export default BaiduSetting
