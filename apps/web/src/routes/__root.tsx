import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import GlobalError from "@/components/errors/global-error";
import NotFound from "@/components/errors/not-found";
import Loader from "@/components/loader";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { buildSeoHead } from "@/lib/seo";
import type { trpc } from "@/utils/trpc";
import "../index.css";

export interface RouterAppContext {
  trpc: typeof trpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => buildSeoHead(),
  notFoundComponent: NotFound,
  errorComponent: GlobalError,
  pendingComponent: Loader,
});

function RootComponent() {
  // const { isLoading, location } = useRouterState({
  //   select: (state) => ({
  //     isLoading: state.isLoading,
  //     location: state.location,
  //   }),
  // });

  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        disableTransitionOnChange={true}
        storageKey="vite-ui-theme"
      >
        <Outlet />
        <Toaster richColors={true} />
      </ThemeProvider>
      <TanStackRouterDevtools position="bottom-left" />
      <ReactQueryDevtools buttonPosition="bottom-right" position="bottom" />
    </>
  );
}
