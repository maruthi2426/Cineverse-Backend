declare module "input" {
  export function text(prompt: string): Promise<string>;
  export function confirm(prompt: string): Promise<boolean>;
}
