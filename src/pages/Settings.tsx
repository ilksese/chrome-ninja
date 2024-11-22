import { useState } from "react"
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

type VideoSetting = {
  enabled: boolean
  notify: boolean
}

type SettingFormData = {
  video: VideoSetting
}

const validationSchema = yup.object({
  video: yup.object({
    enabled: yup.boolean(),
    notify: yup.boolean()
  })
})

function VideoSetting() {
  const { register, watch } = useFormContext<SettingFormData>()
  const [open, setOpen] = useState(true)
  const enabled = watch("video.enabled")
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
            <ListItemText primary="启用" />
            <Switch {...register("video.enabled")} />
          </ListItemButton>
          <ListItemButton sx={{ pl: 4 }} disabled={!enabled}>
            <ListItemIcon>
              <Notifications />
            </ListItemIcon>
            <ListItemText primary="通知" />
            <Switch {...register("video.notify")} />
          </ListItemButton>
        </List>
      </Collapse>
    </>
  )
}

function Settings() {
  const resolver = useYupValidationResolver(validationSchema)
  const methods = useForm<SettingFormData>({
    resolver,
    mode: "onChange",
    defaultValues: {
      video: {
        enabled: false,
        notify: false
      }
    }
  })
  const doSubmit = methods.handleSubmit((values) => {
    console.debug("%c[values]", "color: red;background:yellow", values)
  })
  return (
    <FormProvider {...methods}>
      <form id="Setting" name="Setting" action="" onSubmit={doSubmit}>
        <List subheader={<ListSubheader component={"div"}>Settings</ListSubheader>}>
          <VideoSetting />
        </List>
        <Button fullWidth type="submit" variant="contained" className={methods.formState.isDirty ? void 0 : "hidden"}>
          保存
        </Button>
      </form>
    </FormProvider>
  )
}

export default Settings
