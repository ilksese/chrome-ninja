import { useEffect, useState } from "react"
import SvgBiliBili from "@assets/svg/bilibili.svg?react"
import { useYupValidationResolver } from "@hooks"
import { FormProvider, useForm, useFormContext } from "react-hook-form"
import * as yup from "yup"
import { Api, ExpandLess, ExpandMore, Notifications } from "@mui/icons-material"
import {
  Button,
  Collapse,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Switch
} from "@mui/material"

export type BilibiliSetting = {
  enabled: boolean
  notify: boolean
  blockAD: boolean
}

export type SettingFormData = {
  bilibili: BilibiliSetting
}

const validationSchema = yup.object({
  bilibili: yup.object({
    enabled: yup.boolean(),
    notify: yup.boolean(),
    blockAD: yup.boolean()
  })
})

function VideoSetting() {
  const { register, watch } = useFormContext<SettingFormData>()
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
            <ListItemText primary="直播间默认原画" />
            <Switch {...register("bilibili.enabled")} checked={enabled} />
          </ListItemButton>
          <ListItemButton sx={{ pl: 4 }} disabled={!enabled}>
            <ListItemIcon>
              <Notifications />
            </ListItemIcon>
            <ListItemText primary="开播通知" />
            <Switch {...register("bilibili.notify")} checked={notify} />
          </ListItemButton>
          <ListItemButton sx={{ pl: 4 }} disabled={!enabled}>
            <ListItemIcon>
              <Notifications />
            </ListItemIcon>
            <ListItemText primary="CSS去除广告" />
            <Switch {...register("bilibili.blockAD")} checked={blockAD} />
          </ListItemButton>
        </List>
      </Collapse>
    </>
  )
}

const _defaultOptions: SettingFormData = {
  bilibili: {
    enabled: false,
    notify: false,
    blockAD: false
  }
}

function Settings() {
  const resolver = useYupValidationResolver(validationSchema)
  const methods = useForm<SettingFormData>({
    resolver,
    mode: "onChange",
    defaultValues: _defaultOptions
  })
  const doSubmit = methods.handleSubmit((options) => {
    console.log("submit", options)
    chrome.storage?.local.set({ options })
  })
  const setValues = (values: any) => {
    values &&
      Object.entries(values).forEach(([k, v]) => {
        methods.setValue(k as any, v)
      })
  }
  useEffect(() => {
    chrome.storage?.local.get(["options"]).then(({ options }) => {
      console.log("from storage", options)
      setValues(options)
    })
  }, [])
  return (
    <FormProvider {...methods}>
      <form id="Setting" name="Setting" action="" onSubmit={doSubmit}>
        <List subheader={<ListSubheader component={"div"}>Settings</ListSubheader>}>
          <VideoSetting />
        </List>
        <Button fullWidth type="submit" variant="contained">
          保存
        </Button>
        <Button fullWidth type="button" onClick={() => methods.reset()} variant="contained" className="mt-4">
          撤销更改
        </Button>
        <Button
          fullWidth
          type="button"
          onClick={() => {
            setValues(_defaultOptions)
            chrome.storage?.local.clear()
          }}
          variant="contained"
          className="mt-4">
          重置
        </Button>
      </form>
    </FormProvider>
  )
}

export default Settings
