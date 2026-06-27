# Proposed Android Vocabulary Extension

The Android samples are usable with the generic ArchMap vocabulary, but Android platform diagrams become clearer if these vocabulary values are accepted by the validator.

## Proposed node roles / architecture roles

These may be added as `role` or `architectureRole` rather than `kind`:

```yaml
microservice
backend_for_frontend
worker_service
android_activity
android_service
foreground_service
bound_service
content_provider
broadcast_receiver
view_model
repository
network_client
framework_api
system_service
hal
kernel_driver
hardware_controller
ipc_bus
wireless_link
```

## Proposed Android-specific fields

```yaml
androidComponent:
  - activity
  - service
  - foreground_service
  - bound_service
  - content_provider
  - broadcast_receiver
  - view_model
  - repository
  - work_manager
  - network_client

androidLayer:
  - app
  - framework_api
  - framework_service
  - ipc
  - hal
  - kernel_driver
  - hardware_controller
  - hardware
```

## Proposed provider values

```yaml
android
android_vendor
linux
device
bluetooth
```

## Proposed protocol values

These can remain free-form protocols, but renderers may style them specially:

```yaml
Intent
AppLink
ContentProvider
Binder
AndroidPermission
AndroidFrameworkCall
AIDL_HAL
HIDL_HAL
KernelIOCTL
KernelEvent
HCI
BLE
BluetoothPairing
Keystore
```

## Recommended validation behavior

Unknown Android extension fields should not produce warnings if they are namespaced or explicitly allowed.

Suggested diagnostic levels:

- Unknown `kind`: warning.
- Unknown `androidComponent`: suggestion.
- Unknown `androidLayer`: suggestion.
- Unknown `protocol`: info or no diagnostic by default.
- Missing permission for Android framework access: warning when the edge crosses `framework_boundary` and references protected APIs.
