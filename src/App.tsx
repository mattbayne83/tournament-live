import { Route, Switch } from 'wouter'
import Home from './pages/Home'
import SetupWizard from './pages/setup/SetupWizard'
import AdminDashboard from './pages/admin/AdminDashboard'
import EventBoard, { RemoteBoard } from './pages/board/EventBoard'
import LiveView from './pages/live/LiveView'

function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/setup" component={SetupWizard} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/board" component={EventBoard} />
      <Route path="/t/:id/board" component={RemoteBoard} />
      <Route path="/t/:id" component={LiveView} />
      <Route>
        <div className="grid min-h-screen place-items-center">
          <p className="font-display text-3xl uppercase text-text-soft">Page not found</p>
        </div>
      </Route>
    </Switch>
  )
}

export default App
