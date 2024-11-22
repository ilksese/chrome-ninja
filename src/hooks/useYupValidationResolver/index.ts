import type { AnyObject, ObjectSchema } from "yup"
import { useCallback } from "react"

const useYupValidationResolver = <T extends AnyObject>(validationSchema: ObjectSchema<T>) =>
  useCallback(
    async (data: T) => {
      try {
        const values = await validationSchema.validate(data, {
          abortEarly: false
        })
        return {
          values,
          errors: {}
        }
      } catch (errors: unknown) {
        return {
          values: {},
          errors: (errors as { inner: [] }).inner.reduce(
            (allErrors: AnyObject, currentError: AnyObject) => ({
              ...allErrors,
              [currentError.path]: {
                type: currentError.type ?? "validation",
                message: currentError.message
              }
            }),
            {}
          )
        }
      }
    },
    [validationSchema]
  )
export default useYupValidationResolver
