import { useState } from "react"
import SvgBiliBili from "@assets/svg/bilibili.svg?react"
import { useFormContext } from "react-hook-form"
import { Api, Block, ExpandLess, ExpandMore, Notifications } from "@mui/icons-material"
import { Collapse, List, ListItemButton, ListItemIcon, ListItemText, Switch } from "@mui/material"

function BilibiliSetting() {
  const { register, watch } = useFormContext<ChromeNinja.Options>()
  const [open, setOpen] = useState(true)
  const { enabled, notify, blockAD } = watch("bilibili")
  return (
    <>
      <ListItemButton onClick={() => setOpen((open) => !open)}>
        <ListItemIcon>
          <SvgBiliBili width={24} height={24} />
        </ListItemIcon>
        <ListItemText primary="哔哩哔哩" />
        {open ? <ExpandLess /> : <ExpandMore />}
      </ListItemButton>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <List component="div" disablePadding>
          <ListItemButton sx={{ pl: 4 }}>
            <ListItemIcon>
              <Api />
            </ListItemIcon>
            <ListItemText primary="高画质" />
            <Switch {...register("bilibili.enabled")} checked={enabled} />
          </ListItemButton>
          <ListItemButton sx={{ pl: 4 }}>
            <ListItemIcon>
              <Notifications />
            </ListItemIcon>
            <ListItemText primary="开播通知" />
            <Switch {...register("bilibili.notify")} checked={notify} />
          </ListItemButton>
          <ListItemButton sx={{ pl: 4 }}>
            <ListItemIcon>
              <Block />
            </ListItemIcon>
            <ListItemText primary="过滤广告内容" />
            <Switch {...register("bilibili.blockAD")} checked={blockAD} />
          </ListItemButton>
        </List>
      </Collapse>
    </>
  )
}

export default BilibiliSetting
