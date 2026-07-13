import { onRequestGet as __api_t__id__ts_onRequestGet } from "/Users/mattbayne/Documents/SoftwareProjects/pickleball-tourney/functions/api/t/[id].ts"
import { onRequestPut as __api_t__id__ts_onRequestPut } from "/Users/mattbayne/Documents/SoftwareProjects/pickleball-tourney/functions/api/t/[id].ts"

export const routes = [
    {
      routePath: "/api/t/:id",
      mountPath: "/api/t",
      method: "GET",
      middlewares: [],
      modules: [__api_t__id__ts_onRequestGet],
    },
  {
      routePath: "/api/t/:id",
      mountPath: "/api/t",
      method: "PUT",
      middlewares: [],
      modules: [__api_t__id__ts_onRequestPut],
    },
  ]