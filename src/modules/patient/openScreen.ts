/**
 * Front-office screens are registered in more than one stack, and some (the OPD queue, the
 * sidebar's Register patient) are bare drawer routes with no stack at all. A route name the
 * current navigator does not know is silently dropped, so these go through the drawer section
 * that owns the screen whenever the local navigator cannot take it.
 */
type Nav = {
  getState: () => { type?: string; routeNames?: string[] } | undefined;
  navigate: (...args: any[]) => void;
  replace?: (...args: any[]) => void;
};

export function openScreen(
  navigation: Nav,
  section: string,
  name: string,
  params?: object,
  {
    // false keeps the section's list underneath, so Back has somewhere to go.
    initial = false,
    // Go back to the screen if it is already in the stack, rather than stacking a second copy.
    pop = false,
  }: { initial?: boolean; pop?: boolean } = {},
) {
  if (navigation.getState()?.routeNames?.includes(name)) {
    navigation.navigate(name, params, pop ? { pop: true } : undefined);
    return;
  }
  navigation.navigate(section, { screen: name, params, initial });
}

/** `replace` when inside a stack that has the screen; a drawer has no replace. */
export function replaceScreen(
  navigation: Nav,
  section: string,
  name: string,
  params?: object,
) {
  const state = navigation.getState();
  if (
    state?.type === "stack" &&
    state.routeNames?.includes(name) &&
    navigation.replace
  ) {
    navigation.replace(name, params);
    return;
  }
  openScreen(navigation, section, name, params);
}
