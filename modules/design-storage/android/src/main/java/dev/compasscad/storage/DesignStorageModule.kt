package dev.compasscad.storage

import android.net.Uri
import android.util.AtomicFile
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.IOException

class DesignStorageModule : Module() {
  private fun directory(): File {
    val root = appContext.reactContext?.getExternalFilesDir(null)
      ?: throw IOException("Device storage is unavailable")
    val dir = File(root, "Designs")
    if (!dir.isDirectory && !dir.mkdirs()) throw IOException("Cannot open the designs folder")
    return dir
  }

  override fun definition() = ModuleDefinition {
    Name("CompassDesignStorage")

    Function("directoryUri") { Uri.fromFile(directory()).toString() }

    AsyncFunction("writeDesign") { name: String, source: String ->
      require(name == File(name).name && name.endsWith(".cnext"))
      val target = AtomicFile(File(directory(), name))
      val stream = target.startWrite()
      try {
        stream.write(source.toByteArray(Charsets.UTF_8))
        target.finishWrite(stream)
      } catch (error: Throwable) {
        target.failWrite(stream)
        throw error
      }
    }
  }
}
