import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import PatientsScreen from "./screens/PatientsScreen";
import PatientDetailScreen from "./screens/PatientDetailScreen";
import RegisterPatientScreen from "./screens/RegisterPatientScreen";
import BookAppointmentScreen from "@modules/appointment/screens/BookAppointmentScreen";
import AppointmentBookedScreen from "@modules/appointment/screens/AppointmentBookedScreen";
import MedicalRecordScreen from "@modules/consultation/screens/MedicalRecordScreen";
import ConsultationScreen from "@modules/consultation/screens/ConsultationScreen";

const Stack = createNativeStackNavigator();

/** front-office stack; booking and the chart are reachable here so the desk need not switch section. */
export default function PatientsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PatientsList" component={PatientsScreen} />
      <Stack.Screen name="PatientDetail" component={PatientDetailScreen} />
      <Stack.Screen name="RegisterPatient" component={RegisterPatientScreen} />
      <Stack.Screen name="BookAppointment" component={BookAppointmentScreen} />
      <Stack.Screen name="AppointmentBooked" component={AppointmentBookedScreen} />
      
      <Stack.Screen name="MedicalRecord" component={MedicalRecordScreen} />
      <Stack.Screen name="Consultation" component={ConsultationScreen} />
    </Stack.Navigator>
  );
}
