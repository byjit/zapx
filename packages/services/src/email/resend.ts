import { Resend } from "resend";
import { servicesEnv } from "../env";

export const resend = new Resend(servicesEnv.RESEND_API_KEY);
