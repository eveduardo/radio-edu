import { Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { MainLayout } from "@/layouts";
import { PageLoader } from "@/components";
import { NotFoundPage } from "./NotFoundPage";
import { ROUTES } from "./routes";

export const AppRouter = () => {
	return (
		<Suspense fallback={<PageLoader />}>
			<Routes>
				<Route element={<MainLayout />}>
					{ROUTES.map(({ key, path, Component }) => (
						<Route key={key} path={path} element={<Component />} />
					))}
					<Route path="*" element={<NotFoundPage />} />
				</Route>
			</Routes>
		</Suspense>
	);
};

