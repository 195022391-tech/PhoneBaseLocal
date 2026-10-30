import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    private let runtime = BaseRuntime.shared

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = RootViewController(runtime: runtime)
        window.makeKeyAndVisible()
        self.window = window
        LocalNetworkPermission.shared.requestIfNeeded()
        BackgroundKeepAlive.shared.start()
        runtime.start()
        runtime.setStreamingActive(true)
        return true
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // 锁屏也保持发布端在线；靠 audio keepalive 不被挂起。
        BackgroundKeepAlive.shared.start()
        if runtime.isRunning {
            runtime.setStreamingActive(true)
        }
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        BackgroundKeepAlive.shared.start()
        if runtime.isRunning {
            runtime.setStreamingActive(true)
        }
    }
}
