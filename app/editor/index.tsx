import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { BackHandler, GestureResponderEvent, Platform, StatusBar, StyleSheet, useWindowDimensions, View } from "react-native";
import Canvas, { CanvasRenderingContext2D } from "react-native-canvas";

const fixedCanvasHeight = StatusBar.currentHeight! + 20;

export default function Editor() {
    const router = useRouter();
    const canvas = useRef<Canvas>(null);
    const { width, height } = useWindowDimensions();
    const ctx = useRef<CanvasRenderingContext2D | null>(null);
    const [isTouchHeld, setIsTouchHeld] = useState<boolean>(false);
    const test = () => {
        if (canvas.current) {
            canvas.current.width = width;
            canvas.current.height = height - fixedCanvasHeight;
            ctx.current = canvas.current.getContext('2d');
            ctx.current.fillStyle = 'purple';
            ctx.current.fillRect(0, 0, 100, 100);
        }
    }
    const handleTouchStart = (e: GestureResponderEvent) => {
        if (canvas.current) {
            if (ctx.current) {
                setIsTouchHeld(true);
                ctx.current.fillStyle = 'white';
                ctx.current.fillText('Touched!', e.nativeEvent.locationX, e.nativeEvent.locationY);
            }
        }
    }
    const handleTouchMove = (e: GestureResponderEvent) => {
        if (isTouchHeld && canvas.current) {
            if (ctx.current) {
                ctx.current.fillStyle = 'white';
                ctx.current.fillRect(e.nativeEvent.locationX, e.nativeEvent.locationY, 5, 5);
            }
        }
    }
    const handleTouchEnd = (e: GestureResponderEvent) => {
        setIsTouchHeld(false);
    }
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
        test();

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
