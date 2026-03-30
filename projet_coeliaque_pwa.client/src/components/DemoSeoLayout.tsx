import { Outlet } from "react-router-dom";
import { useRobotsDirective } from "../seo/useSeo";

export default function DemoSeoLayout() {
    useRobotsDirective("noindex, nofollow");

    return <Outlet />;
}
