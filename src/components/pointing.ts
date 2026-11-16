/* Handlers for an element that does something while the pointer is over it
   or it (or something in it) has focus, so keyboard users get it too.
   `onPoint` is called with true on the way in and false on the way out. */
export const pointHandlers = (onPoint: (pointed: boolean) => void) => ({
  onMouseEnter: () => onPoint(true),
  onMouseLeave: () => onPoint(false),
  onFocus: () => onPoint(true),
  onBlur: () => onPoint(false),
});
