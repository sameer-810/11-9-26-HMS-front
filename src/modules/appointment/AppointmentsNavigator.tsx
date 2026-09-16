import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import AppointmentsScreen from "./screens/AppointmentsScreen";
import BookAppointmentScreen from "./screens/BookAppointmentScreen";
import AppointmentBookedScreen from "./screens/AppointmentBookedScreen";
import RescheduleAppointmentScreen from "./screens/RescheduleAppointmentScreen";
import PatientDetailScreen from "@modules/patient/screens/PatientDetailScreen";
import RegisterPatientScreen from "@modules/patient/screens/RegisterPatientScreen";
import EditPatientScreen from "@modules/patient/screens/EditPatientScreen";

const Stack = createNativeStackNavigator();

export default function AppointmentsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AppointmentsList" component={AppointmentsScreen} />
      <Stack.Screen name="BookAppointment" component={BookAppointmentScreen} />
      <Stack.Screen
        name="AppointmentBooked"
        component={AppointmentBookedScreen}
      />
      <Stack.Screen
        name="RescheduleAppointment"
        component={RescheduleAppointmentScreen}
      />
      {/*
        Reachable from a booking: the desk often needs the patient's record
        immediately after booking them, and "register first" is a dead end
        without a way to get to the form.
      */}
      <Stack.Screen name="PatientDetail" component={PatientDetailScreen} />
      <Stack.Screen name="RegisterPatient" component={RegisterPatientScreen} />
      <Stack.Screen name="EditPatient" component={EditPatientScreen} />
    </Stack.Navigator>
  );
}
