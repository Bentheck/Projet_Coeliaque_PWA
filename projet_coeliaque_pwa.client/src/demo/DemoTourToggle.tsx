// src/demo/DemoTourToggle.tsx
import React from "react";
import { useDemoTour, type DemoTourId } from "./DemoTourContext";

interface DemoTourToggleProps {
    tour: DemoTourId;          // "calculator" | "grocery"
    label?: string;            // optional override, e.g. translated text
    small?: boolean;           // optional compact styling
}

export const DemoTourToggle: React.FC<DemoTourToggleProps> = ({
    tour,
    label = "Guided mode",
    small = false,
}) => {
    const { activeTour, startTour, endTour } = useDemoTour();
    const isOn = activeTour === tour;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const checked = e.target.checked;
        if (checked) {
            // Start from first step of this tour
            startTour(tour, 1);
        } else {
            endTour();
        }
    };

    return (
        <div className={`form-check form-switch d-flex align-items-center ${small ? "fs-6" : ""}`}>
            <input
                className="form-check-input"
                type="checkbox"
                id={`demo-tour-toggle-${tour}`}
                checked={isOn}
                onChange={handleChange}
            />
            <label
                className="form-check-label ms-2"
                htmlFor={`demo-tour-toggle-${tour}`}
            >
                {label}
            </label>
        </div>
    );
};
