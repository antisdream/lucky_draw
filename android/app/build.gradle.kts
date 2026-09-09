plugins { id("com.android.application") }
android {
    namespace = "com.antisdream.luckydraw"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.antisdream.luckydraw"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "1.2.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { buildConfig = true }
    signingConfigs {
        create("release") {
            providers.environmentVariable("LUCKY_DRAW_STORE_FILE").orNull?.let { storeFile = file(it) }
            storePassword = providers.environmentVariable("LUCKY_DRAW_STORE_PASSWORD").orNull
            keyAlias = "lucky-draw-release"
            keyPassword = providers.environmentVariable("LUCKY_DRAW_KEY_PASSWORD").orNull
            storeType = "PKCS12"
        }
    }
    buildTypes {
        getByName("release") {
            isDebuggable = false
            signingConfig = signingConfigs.getByName("release")
            optimization { enable = true }
        }
        getByName("debug") { versionNameSuffix = "-test" }
    }
}
dependencies {
    implementation("androidx.webkit:webkit:1.17.0")
    implementation("androidx.activity:activity:1.13.0")
}
abstract class BundleGame : DefaultTask() {
    @get:InputFile abstract val source: RegularFileProperty
    @get:OutputDirectory abstract val output: DirectoryProperty
    @TaskAction fun bundle() {
        val directory = output.get().asFile
        directory.mkdirs()
        source.get().asFile.copyTo(directory.resolve("index.html"), overwrite = true)
    }
}
val syncGame by tasks.registering(BundleGame::class) {
    source.set(rootProject.file("../index.html"))
    output.set(layout.buildDirectory.dir("generated/gameAssets"))
}
androidComponents.onVariants { variant ->
    variant.sources.assets?.addGeneratedSourceDirectory(syncGame, BundleGame::output)
}
