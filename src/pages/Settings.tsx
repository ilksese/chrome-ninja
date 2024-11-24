import type { BaiduSettingType } from "@components/settings/BiaduSetting"
import type { BilibiliSettingType } from "@components/settings/BilibiliSetting"
import { useEffect } from "react"
import BaiduSetting from "@components/settings/BiaduSetting"
import BilibiliSetting from "@components/settings/BilibiliSetting"
import { useYupValidationResolver } from "@hooks"
import { FormProvider, useForm } from "react-hook-form"
import * as yup from "yup"
import { Button, List, ListSubheader } from "@mui/material"

export type SettingFormData = {
  bilibili: BilibiliSettingType
  baidu: BaiduSettingType
}

const validationSchema = yup.object({
  bilibili: yup.object({
    enabled: yup.boolean(),
    notify: yup.boolean(),
    blockAD: yup.boolean()
  })
})

const _defaultOptions: SettingFormData = {
  bilibili: {
    enabled: false,
    notify: false,
    blockAD: false
  },
  baidu: {
    clearSearch: true
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
          <BilibiliSetting />
          <BaiduSetting />
        </List>
        <Button fullWidth type="submit" variant="contained">
          保存
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
