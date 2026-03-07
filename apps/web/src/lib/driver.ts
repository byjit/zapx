import { type Config, type DriveStep, driver } from "driver.js";
import "driver.js/dist/driver.css";

// Use an empty string for now, such that we can extend it easily in the future.
export const TOUR_KEY: string = "";

export type DriverProps = {
  steps: DriveStep[];
  options?: Config;
};

export const startDriver = ({ steps, options }: DriverProps) => {
  const driverObj = driver({
    showProgress: true,
    steps,
    ...options,
  });

  driverObj.drive();
  return driverObj;
};

export const highlightElement = (
  element: string,
  popover: NonNullable<DriveStep["popover"]>,
  options?: Config
) => {
  const driverObj = driver(options);
  driverObj.highlight({
    element,
    popover,
  });
  return driverObj;
};
