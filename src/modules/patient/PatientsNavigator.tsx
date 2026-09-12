import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import PatientsScreen from "./screens/PatientsScreen";
import PatientDetailScreen from "./screens/PatientDetailScreen";
import RegisterPatientScreen from "./screens/RegisterPatientScreen";
import BookAppointmentScreen from "@modules/appointment/screens/BookAppointmentScreen";
import AppointmentBookedScreen from "@modules/appointment/screens/AppointmentBookedScreen";

const Stack = createNativeStackNavigator();

/**
 * The front-office stack.
 *
 * Booking screens are reachable from here as well as from the appointments
 * section, because the journey that actually happens at a desk is "find the
 * patient, then book them" — sending the user back to a different section to
 * finish the job they started is how a queue builds.
 */
export default function PatientsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PatientsList" component={PatientsScreen} />
      <Stack.Screen name="PatientDetail" component={PatientDetailScreen} />
      <Stack.Screen name="RegisterPatient" component={RegisterPatientScreen} />
      <Stack.Screen name="BookAppointment" component={BookAppointmentScreen} />
      <Stack.Screen name="AppointmentBooked" component={AppointmentBookedScreen} />
    </Stack.Navigator>
  );
}
