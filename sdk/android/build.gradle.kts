plugins {
    id("com.android.library") version "8.7.3"
    kotlin("android") version "2.0.21"
}

android {
    namespace = "ng.name.maxauth"
    compileSdk = 35
    defaultConfig { minSdk = 26 }
}
