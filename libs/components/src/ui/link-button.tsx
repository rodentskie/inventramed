"use client"

import type { HTMLChakraProps, RecipeProps } from "@chakra-ui/react"
import { createRecipeContext } from "@chakra-ui/react"
import type * as React from "react"

export type LinkButtonProps = HTMLChakraProps<"a", RecipeProps<"button">>

const { withContext } = createRecipeContext({ key: "button" })

// Annotated so the declaration build doesn't need Chakra's internal recipe types.
export const LinkButton: React.ForwardRefExoticComponent<
  LinkButtonProps & React.RefAttributes<HTMLAnchorElement>
> = withContext<HTMLAnchorElement, LinkButtonProps>("a")
