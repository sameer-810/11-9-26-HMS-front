// MUST be the very first import — react-native-gesture-handler requires this
// at the top of the entry file for gestures to work reliably.
import "react-native-gesture-handler";
import { registerRootComponent } from "expo";

import App from "./App";

registerRootComponent(App);
