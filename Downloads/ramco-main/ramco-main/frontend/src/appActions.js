export const ACTION = {
  ADD_EMPLOYEE: 'add-employee',
  ADD_USER: 'add-user',
  ADD_DEPARTURE: 'add-departure',
};

export function emitAction(type, payload) {
  window.dispatchEvent(new CustomEvent('rh-action', { detail: { type, payload } }));
}
