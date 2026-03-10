export const $ = <T extends Element>(query: string, context: ParentNode = document): T => {
  const node = context.querySelector<T>(query);
  if (!node) throw new Error(`Missing required node: ${query}`);
  return node;
};

export const $$ = <T extends Element>(query: string, context: ParentNode = document): T[] =>
  Array.from(context.querySelectorAll<T>(query));

export const once = (element: EventTarget, eventName: string): Promise<Event> =>
  new Promise((resolve) =>
    element.addEventListener(eventName, (event) => resolve(event), { once: true })
  );

export const redraw = (node: HTMLElement): number => node.clientHeight;

export const setVar = (
  key: string,
  value: number | string,
  node: HTMLElement = document.body
): void => {
  node.style.setProperty(`--${key}`, String(value));
};

export const calcTextWidth = (text: number | string): string => {
  const div = document.body.appendChild(document.createElement('div'));
  div.classList.add('size-test');
  div.textContent = String(text);
  const width = div.clientWidth;
  div.remove();
  return `${width + 1}px`;
};
