import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { BackHandler, Platform, StatusBar, StyleSheet, useWindowDimensions, View } from "react-native";
import Canvas from "react-native-canvas";

const fixedCanvasHeight = StatusBar.currentHeight! + 20;

export default function Editor() {
    const router = useRouter();
    const canvas = useRef<Canvas>(null);
    const { width, height } = useWindowDimensions();
    const delayedTest = () => {
        return new Promise(resolve => {
            setTimeout(() => {
                // This is where your original logic (test() or whatever comes after) runs
                console.log('Delayed action (1s timeout) completed!');
                // test(); // You can call your test function here
                resolve(true); 
            }, 1000);
        });
    };

    useEffect(() => {
        const backHandler = () => {
            delayedTest().then(() => {
                router.back();
            });
            return true;
        };

        if (Platform.OS === 'android') {
            BackHandler.addEventListener('hardwareBackPress', backHandler);
        }
    }, [router]);
    const handleGoBack = async () => {
        await delayedTest();
        router.push('/');
    };

    return (
        <>
            <View style={styles.topbar}>
                <ThemedText type='default' onPress={handleGoBack}>go back</ThemedText>
            </View>
            <View style={styles.container}>
                <Canvas ref={canvas} style={styles.canvas}/>
            </View>
        </>
    )
}

const styles = StyleSheet.create({
    topbar: {
        backgroundColor: Colors.dark.background,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingTop: StatusBar.currentHeight,
        height: fixedCanvasHeight + 40,
        zIndex: 3,
        display: 'flex',
        justifyContent: 'center',
        paddingHorizontal: 20,
        borderBottomColor: Colors.dark.border,
        borderBottomWidth: 0.75,
        boxShadow: '0px 0px 13px 3px rgba(0, 0, 0, 0.5)'
    },
    container: {
        flex: 1,
        backgroundColor: 'black',
        marginTop: fixedCanvasHeight
    },
    canvas: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0
    }
})
