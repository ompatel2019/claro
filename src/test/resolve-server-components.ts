import {
  Children,
  isValidElement,
  cloneElement,
  type ReactNode,
  type ReactElement,
} from "react";
// Resolve just async server components; normal client components render with React.
export async function resolve(node: ReactNode): Promise<ReactNode> {
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (
    typeof element.type === "function" &&
    element.type.constructor.name === "AsyncFunction"
  ) {
    const component = element.type as (props: unknown) => Promise<ReactNode>;
    return resolve(await component(element.props));
  }
  if (element.props.children !== undefined) {
    const children = await Promise.all(
      Children.toArray(element.props.children).map(resolve),
    );
    return cloneElement(element, undefined, ...children);
  }
  return element;
}
