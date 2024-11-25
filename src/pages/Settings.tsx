import BaiduSetting from "@components/settings/BiaduSetting"
import BilibiliSetting from "@components/settings/BilibiliSetting"
import { useYupValidationResolver } from "@hooks"
import { useAtom } from "jotai"
import { FormProvider, useForm } from "react-hook-form"
import * as yup from "yup"
import { Button, List, ListSubheader } from "@mui/material"
import { optionsAtom } from "@/store/options"

const validationSchema = yup.object<ChromeNinja.Options>({})

export default function Settings() {
  const [options, setOptions] = useAtom(optionsAtom)
  const resolver = useYupValidationResolver(validationSchema)
  const methods = useForm<ChromeNinja.Options>({
    resolver,
    mode: "onChange",
    defaultValues: options
  })
  const doSubmit = methods.handleSubmit((options) => {
    setOptions(options)
  })
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
            methods.reset()
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
