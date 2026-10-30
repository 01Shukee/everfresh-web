import * as React from "react";
export default function Link({ href, children, prefetch, ...p }: any) { return <a href={href} {...p}>{children}</a>; }
